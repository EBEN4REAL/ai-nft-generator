import { useState, useEffect } from "react";
import { BrowserProvider, ethers, parseUnits } from "ethers"; // ✅ Ethers v6
import axios from "axios";

// Components
import Spinner from "react-bootstrap/Spinner";
import Navigation from "./components/Navigation";

// ABIs
import NFT from "./abis/NFT.json";

// Config
import config from "./config.json";

function App() {
  const [provider, setProvider] = useState(null);
  const [account, setAccount] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState("");
  const [url, setURL] = useState(null);
  const [nft, setNFT] = useState(null);

  const loadBlockchainData = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    const provider = new BrowserProvider(window.ethereum);
    setProvider(provider);

    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    setAccount(address);

    const network = await provider.getNetwork();

    const nft = new ethers.Contract(
      config[network.chainId].nft.address,
      NFT,
      provider
    );
    setNFT(nft);
  };

  useEffect(() => {
    loadBlockchainData();
  }, []);

  const uploadImageToPinata = async (imageData, name, description) => {
    const pinataJWT = process.env.REACT_APP_PINATA_JWT?.trim();

    if (!pinataJWT) {
      throw new Error(
        "Pinata JWT token is missing from environment variables."
      );
    }

    // 1. First upload the image file
    const imageFile = new File([imageData], "image.jpeg", {
      type: "image/jpeg",
    });
    const imageFormData = new FormData();
    imageFormData.append("file", imageFile);

    try {
      setMessage("Uploading image to IPFS...");

      // Upload image to Pinata
      const imageRes = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        imageFormData,
        {
          headers: {
            Authorization: `Bearer ${pinataJWT}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const imageHash = imageRes.data.IpfsHash;
      const imageUrl = `https://gateway.pinata.cloud/ipfs/${imageHash}`;

      // 2. Create and upload metadata JSON
      const metadata = {
        name,
        description,
        image: imageUrl,
        attributes: [], // Add any additional attributes if needed
      };

      setMessage("Uploading metadata...");

      const metadataRes = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        metadata,
        {
          headers: {
            Authorization: `Bearer ${pinataJWT}`,
            "Content-Type": "application/json",
          },
        }
      );

      const metadataHash = metadataRes.data.IpfsHash;
      const metadataUrl = `https://gateway.pinata.cloud/ipfs/${metadataHash}`;

      setMessage("Upload complete!");
      setURL(metadataUrl);

      return {
        imageUrl,
        metadataUrl,
        imageHash,
        metadataHash,
      };
    } catch (error) {
      console.error("Pinata upload error:", error);
      setMessage("Upload failed. See console for details.");
      throw new Error(`Failed to upload to Pinata: ${error.message}`);
    }
  };

  async function query(data) {
    const url =
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0";
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.REACT_APP_HUGGING_FACE_API_KEY}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify(data),
    });
    const result = await response.blob();
    return result;
  }

  const createImage = async () => {
    setMessage("Generating Image...");

    try {
      const response = await query({ inputs: `\`${description}\`` });

      const reader = new FileReader();

      reader.onloadend = () => {
        const img = reader.result;
        setImage(img);
      };

      reader.readAsDataURL(response);

      return response;
    } catch (error) {
      console.error("Error generating image:", error);
      setMessage("Failed to generate image. Please try again.");
      setIsWaiting(false);
    }
  };

  const handleUpload = async (imageBlob) => {
    try {
      const result = await uploadImageToPinata(imageBlob, name, description);
      console.log("Upload result:", result);
      return result.metadataUrl;
    } catch (err) {
      console.error(err);
    }
  };

  const submitHandler = async (e) => {
    e.preventDefault();

    console.log("NAME => ", name);
    console.log("DESCRIPTION => ", description);

    if (name === "" || description === "") {
      window.alert("Please provide a name and description");
      return;
    }

    setIsWaiting(true);

    // Call AI API to generate a image based on description
    const imageData = await createImage();

    // Upload image to IPFS (NFT.Storage)
    const url = await handleUpload(imageData);
    setURL(url);

    // Mint NFT
    await mintImage(url);

    setIsWaiting(false);
    setMessage("");
  };

  const mintImage = async (tokenURI) => {
    setMessage("Waiting for Mint...");

    const signer = await provider.getSigner();
    const transaction = await nft
      .connect(signer)
      .mint(tokenURI, { value: parseUnits("1", "ether") });
    await transaction.wait();
  };

  return (
    <div style={{position: "relative", minHeight: "100vh"}}>
      <Navigation account={account} setAccount={setAccount} />
      <div class="lines_1"></div>
      <div class="lines_2"></div>
      <div class="glow_1"></div>
      <div class="glow_2"></div>

      <div className="nft-form-container">
        <form onSubmit={submitHandler} className="nft-form">
          <div className="form-group">
            <label htmlFor="nft-name">NFT Name</label>
            <input
              id="nft-name"
              type="text"
              placeholder="Create a name (e.g. Cyber Lion)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={3}
              maxLength={30}
              className="form-input"
            />
            <small className="character-count">{name.length}/30</small>
          </div>

          <div className="form-group">
            <label htmlFor="nft-description">Description</label>
            <textarea
              id="nft-description"
              placeholder="Describe your NFT (e.g. A futuristic lion with cybernetic enhancements)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={10}
              maxLength={150}
              rows={4}
              className="form-textarea"
            />
            <small className="character-count">{description.length}/150</small>
          </div>

          <button type="submit" className="mint-button" disabled={isWaiting}>
            {isWaiting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                {message}
              </>
            ) : (
              "Create & Mint"
            )}
          </button>
        </form>

        <div className="image-preview">
          {!isWaiting && image ? (
            <>
              <img
                src={image}
                alt="AI generated NFT"
                className="preview-image"
              />
              <div className="image-overlay">
                <h3>{name || "Untitled NFT"}</h3>
                <p>{description || "No description provided"}</p>
              </div>
            </>
          ) : isWaiting ? (
            <div className="loading-state">
              <Spinner animation="border" variant="primary" />
              <p className="loading-text">{message}</p>
            </div>
          ) : (
            <div className="empty-state">
              <div className="placeholder-icon">
                <i className="fas fa-image"></i>
              </div>
              <p>Your AI-generated NFT will appear here</p>
            </div>
          )}
        </div>
      </div>

      {!isWaiting && url && (
        <p>
          View&nbsp;
          <a href={url} target="_blank" rel="noreferrer">
            Metadata
          </a>
        </p>
      )}
    </div>
  );
}

export default App;
