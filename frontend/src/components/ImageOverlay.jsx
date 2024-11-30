function ImageOverlay({ imgsrc, close }) {
    return (
      <div className="overlay-container">
        <div className="overlay-content">
          <img src={imgsrc} alt="Fullscreen" className="overlay-image" />
          <button className="overlay-close-button" onClick={close}>
            ✖
          </button>
        </div>
      </div>
    );
  }
  
  export default ImageOverlay;
  