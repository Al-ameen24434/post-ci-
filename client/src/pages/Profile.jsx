import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, getToken, uploadFile } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';
import Avatar from '../components/Avatar.jsx';
import FriendButton from '../components/FriendButton.jsx';

function FileButton({ kind, label, onDone }) {
  const { user } = useAuth();
  const token = getToken();
  const ref = useRef(null);

  const change = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url } = await uploadFile(file, kind, token);
      const { user: updated } = await api('/auth/me', { token });
      onDone(updated);
    } catch (err) {
      alert(err.message);
    }
    ref.current.value = '';
  };

  return (
    <>
      <input ref={ref} type="file" accept="image/*" hidden onChange={change} />
      <button className="ghost tiny" type="button" onClick={() => ref.current?.click()}>
        {label}
      </button>
    </>
  );
}

function PersonCard({ person }) {
  const { user } = useAuth();
  const isSelf = user.id === person.id;
  return (
    <div className="card person">
      <Avatar user={person} size={56} />
      <div>
        <strong>{person.name}</strong>
        {person.bio && <p className="muted">{person.bio}</p>}
      </div>
      {!isSelf && <FriendButton userId={person.id} />}
    </div>
  );
}

export default function Profile() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const q = params.get('q');
  const { user: me, updateUser } = useAuth();
  const token = getToken();
  const isMe = !id || Number(id) === me.id;

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [friends, setFriends] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');

  const targetId = isMe ? me.id : Number(id);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (q) {
        const { users } = await api(`/users?q=${encodeURIComponent(q)}`, { token });
        setResults(users);
        setProfile(null);
      } else {
        const [{ user }, postData, friendData] = await Promise.all([
          api(`/users/${targetId}`, { token }),
          api(`/posts/user/${targetId}`, { token }),
          api(`/friends/list/${targetId}`, { token }),
        ]);
        setProfile(user);
        setPosts(postData.posts);
        setFriends(friendData.friends);
        setBio(user.bio || '');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, targetId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const saveBio = async (e) => {
    e.preventDefault();
    try {
      const { user: updated } = await api('/users/me', { method: 'PATCH', token, body: { bio } });
      setProfile(updated);
      setBio(updated.bio);
      updateUser(updated);
      setEditing(false);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="center">Loading…</div>;
  if (error) return <div className="card error">{error}</div>;

  if (results) {
    return (
      <div className="feed">
        <div className="card">
          <strong>{results.length}</strong> {results.length === 1 ? 'person' : 'people'} found for “
          {q}”
        </div>
        {results.length === 0 && <div className="card center muted">No results.</div>}
        {results.map((person) => (
          <PersonCard key={person.id} person={person} />
        ))}
      </div>
    );
  }

  return (
    <div className="profile">
      <div className="cover-wrap">
        {profile.cover_url ? (
          <img className="cover" src={profile.cover_url} alt="Cover" />
        ) : (
          <div className="cover placeholder" />
        )}
        {isMe && <FileButton kind="cover" label="Edit cover" onDone={updateUser} />}
      </div>
      <div className="profile-head card">
        <Avatar user={profile} size={96} />
        <div className="grow">
          <h2>{profile.name}</h2>
          {editing ? (
            <form className="row gap" onSubmit={saveBio}>
              <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about yourself" />
              <button type="submit" className="primary">Save</button>
              <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
            </form>
          ) : (
            <p className="muted">
              {profile.bio || 'No bio yet.'}{' '}
              {isMe && <button className="link-btn" onClick={() => setEditing(true)}>Edit</button>}
            </p>
          )}
        </div>
        {isMe && <FileButton kind="avatar" label="Change photo" onDone={updateUser} />}
        {!isMe && <FriendButton userId={profile.id} />}
      </div>

      <div className="profile-body">
        <div className="feed">
          {posts.length === 0 && <div className="card center muted">No posts yet.</div>}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
        <aside className="card sidebar">
          <h3>Friends ({friends.length})</h3>
          {friends.length === 0 && <p className="muted">No friends yet.</p>}
          <ul className="friend-list">
            {friends.map((f) => (
              <li key={f.id}>
                <a className="row" href={`/profile/${f.id}`}>
                  <Avatar user={f} size={36} />
                  <span>{f.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}