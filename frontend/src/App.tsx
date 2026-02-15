import { useEffect, useState } from "react";
import { getHealth } from "./services/api/health";
import "./App.css";

function App() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    getHealth()
      .then(() => setStatus("backend connected"))
      .catch(() => setStatus("backend disconnected"));
  }, []);

  return <div>{status}</div>;
}

export default App;
