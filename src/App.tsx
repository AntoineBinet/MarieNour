import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { Spinner } from "./ui";
import Layout from "./components/Layout";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import Login from "./pages/Login";
import { Mentions, Confidentialite, CGU } from "./pages/Legal";

// Découpage en chunks (code-splitting) : chaque page est chargée à la demande au
// lieu d'alourdir le bundle initial (Finance, EventDetail… pèsent lourd). Seul le
// CONTENU de page « suspend » — le cadre (barre latérale, recherche, cloche) reste
// affiché pendant le chargement. Login et les pages légales restent eager (entrée
// non connectée + liens publics, doivent s'afficher immédiatement).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Lists = lazy(() => import("./pages/Lists"));
const Notes = lazy(() => import("./pages/Notes"));
const Trips = lazy(() => import("./pages/Trips"));
const TripDetail = lazy(() => import("./pages/TripDetail"));
const Events = lazy(() => import("./pages/Events"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const Recipes = lazy(() => import("./pages/Recipes"));
const Inspiration = lazy(() => import("./pages/Inspiration"));
const Photos = lazy(() => import("./pages/Photos"));
const Friends = lazy(() => import("./pages/Friends"));
const Feed = lazy(() => import("./pages/Feed"));
const Fil = lazy(() => import("./pages/Fil"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Finance = lazy(() => import("./pages/Finance"));
const Profile = lazy(() => import("./pages/Profile"));
const Appearance = lazy(() => import("./pages/Appearance"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const Admin = lazy(() => import("./pages/Admin"));
const Invite = lazy(() => import("./pages/Invite"));
const Help = lazy(() => import("./pages/Help"));

function PageFallback() {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: "4rem 0" }}>
      <Spinner />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "100vh" }}><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <PwaUpdatePrompt />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/i/:token" element={<Suspense fallback={<PageFallback />}><Invite /></Suspense>} />
      <Route path="/mentions-legales" element={<Mentions />} />
      <Route path="/cgu" element={<CGU />} />
      <Route path="/confidentialite" element={<Confidentialite />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Layout>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/listes" element={<Lists />} />
                  <Route path="/notes" element={<Notes />} />
                  <Route path="/voyages" element={<Trips />} />
                  <Route path="/voyages/:id" element={<TripDetail />} />
                  <Route path="/evenements" element={<Events />} />
                  <Route path="/evenements/:id" element={<EventDetail />} />
                  <Route path="/recettes" element={<Recipes />} />
                  <Route path="/inspiration" element={<Inspiration />} />
                  <Route path="/photos" element={<Photos />} />
                  <Route path="/depenses" element={<Expenses />} />
                  <Route path="/finances" element={<Finance />} />
                  <Route path="/feed" element={<Feed />} />
                  <Route path="/fil" element={<Fil />} />
                  <Route path="/amis" element={<Friends />} />
                  <Route path="/aide" element={<Help />} />
                  <Route path="/profil" element={<Profile />} />
                  <Route path="/personnalisation" element={<Appearance />} />
                  <Route path="/u/:handle" element={<PublicProfile />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </Layout>
          </Protected>
        }
      />
      </Routes>
    </>
  );
}
