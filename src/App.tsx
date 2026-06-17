import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { Spinner } from "./ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { Mentions, Confidentialite } from "./pages/Legal";
import Dashboard from "./pages/Dashboard";
import Lists from "./pages/Lists";
import Notes from "./pages/Notes";
import Trips from "./pages/Trips";
import TripDetail from "./pages/TripDetail";
import Recipes from "./pages/Recipes";
import Inspiration from "./pages/Inspiration";
import Photos from "./pages/Photos";
import Friends from "./pages/Friends";
import Feed from "./pages/Feed";
import Expenses from "./pages/Expenses";
import Finance from "./pages/Finance";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Admin from "./pages/Admin";
import Invite from "./pages/Invite";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "100vh" }}><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/i/:token" element={<Invite />} />
      <Route path="/mentions-legales" element={<Mentions />} />
      <Route path="/confidentialite" element={<Confidentialite />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/listes" element={<Lists />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/voyages" element={<Trips />} />
                <Route path="/voyages/:id" element={<TripDetail />} />
                <Route path="/recettes" element={<Recipes />} />
                <Route path="/inspiration" element={<Inspiration />} />
                <Route path="/photos" element={<Photos />} />
                <Route path="/depenses" element={<Expenses />} />
                <Route path="/finances" element={<Finance />} />
                <Route path="/feed" element={<Feed />} />
                <Route path="/amis" element={<Friends />} />
                <Route path="/profil" element={<Profile />} />
                <Route path="/u/:handle" element={<PublicProfile />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </Protected>
        }
      />
    </Routes>
  );
}
