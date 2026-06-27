import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Landing from "./pages/Landing";
import Play from "./pages/Play";
import Dashboard from "./pages/Dashboard";
import Research from "./pages/Research";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/play" element={<Play />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/research" element={<Research />} />
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes>
  );
}
