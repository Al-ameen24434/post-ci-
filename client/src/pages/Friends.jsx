import { useState, useEffect, useCallback } from 'react';
import { api, getToken } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';

export default function Friends() {
  const { user } = useAuth();
  const token = getToken();
  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [reqData, friendData] = await Promise.all([
        api('/friends/requests', { token }),
        api(`/friends/list/${user.id}`, { token }),
      ]);
      setRequests(reqData.requests);
      setFriends(friendData.friends);
    } finally {
      setLoading(false);
    }
  }, [token, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (otherId, action) => {
    await api(`/friends/${action}/${otherId}`, { method: 'POST', token });
    load();
  };

  const unfriend = async (id) => {
    await api(`/friends/remove/${id}`, { method: 'POST', token });
    load();
  };

  if (loading) return <div className="center">Loading…</div>;

  return (
    <div className="feed">
      <div className="card">
        <h3>Friend requests</h3>
        {requests.length === 0 && <p className="muted">No pending requests.</p>}
        {requests.map((r) => (
          <div className="person" key={r.id}>
            <a className="row" href={`/profile/${r.id}`}>
              <Avatar user={r} size={44} />
              <strong>{r.name}</strong>
            </a>
            <span className="row gap">
              <button className="primary" onClick={() => respond(r.id, 'accept')}>
                Accept
              </button>
              <button className="ghost" onClick={() => respond(r.id, 'decline')}>
                Decline
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Your friends ({friends.length})</h3>
        {friends.length === 0 && <p className="muted">No friends yet — search for people to connect.</p>}
        {friends.map((f) => (
          <div className="person" key={f.id}>
            <a className="row" href={`/profile/${f.id}`}>
              <Avatar user={f} size={44} />
              <strong>{f.name}</strong>
            </a>
            <button className="ghost" onClick={() => unfriend(f.id)}>
              Unfriend
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}