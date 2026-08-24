import { Routes, Route, Navigate, NavLink, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Feed from './pages/Feed.jsx';
import Profile from './pages/Profile.jsx';
import Friends from './pages/Friends.jsx';
import Avatar from './components/Avatar.jsx';

function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/profile?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        📘 Bookface
      </Link>
      <form className="search" onSubmit={submitSearch}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people..."
          aria-label="Search people"
        />
        <button type="submit">Search</button>
      </form>
      <nav className="nav-links">
        <NavLink to="/" end>
          Feed
        </NavLink>
        <NavLink to="/friends">Friends</NavLink>
        <NavLink to={`/profile/${user.id}`} className="me">
          <Avatar user={user} size={28} />
          <span>{user.name.split(' ')[0]}</span>
        </NavLink>
        <button className="link-btn" onClick={logout}>
          Log out
        </button>
      </nav>
    </header>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <div className="app">
      {user && <NavBar />}
      <main className="content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Feed />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/profile/:id"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/friends"
            element={
              <RequireAuth>
                <Friends />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}