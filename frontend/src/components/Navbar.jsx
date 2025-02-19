import { useState } from "react";
import logoaitalents from "../assets/logoaitalents.png"
function Navbar() {
  const [lightMode, setLightMode] = useState(true);
  function toggleMode(){
    if(lightMode){
      document.body.classList.add('darkmode')
      setLightMode(false);
    }
    else{
      document.body.classList.remove('darkmode');
      setLightMode(true);
    }
  }
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="light-dark-mode-switch" onClick={toggleMode}>
          <span className="material-symbols-outlined">
            { lightMode ? "light_mode" : "dark_mode"}
          </span>

        </div>
      </div>

      <div className="navbar-right">

        <span className="name">Data Analyzer</span>
      </div>
      <img src={logoaitalents} alt="" className="aitallogo"></img>

    </nav>
  );
}

export default Navbar;
