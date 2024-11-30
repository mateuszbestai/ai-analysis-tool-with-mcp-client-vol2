import logobat from "../assets/logobat.png";
import logoaitalents from "../assets/logoaitalents.png";
function Navbar() {
    return (
        <>
            <header className="sticky">
                <nav className="navbar navbar-expand-md p-1">
                    <div className="container-fluid">
                        <div className="navbar-brand">
                            <img
                                src={logobat}
                                alt="bat logo"
                                height="30"
                                className="d-inline-block"
                            ></img>
                        </div>
                        <ul className="navbar-nav me-auto">
                            <li className="nav-item">
                                <h4 className="d-none d-md-inline-block">
                                    B.A.T Data Analysis AI
                                </h4>
                            </li>
                        </ul>
                        <a
                            className="shareButtonLink nav-item"
                            href="https://bat.sharepoint.com/sites/PL19-aitalents"
                        >
                            <h3 className="shareButtonText d-none d-md-inline-block">
                                Powered by&nbsp;AI talents
                            </h3>
                            <img
                                src={logoaitalents}
                                alt="ai-tal logo"
                                height="48"
                                width="48"
                                className="shareButtonLogo d-inline-block align-center"
                            ></img>
                        </a>
                    </div>
                </nav>
            </header>
        </>
    );
}

export default Navbar;
