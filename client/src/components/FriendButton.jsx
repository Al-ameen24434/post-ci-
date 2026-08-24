import { useState, useEffect, useCallback } from 'react';
import { api, getToken } from '../api.js';

export default function FriendButton({ userId }) {
  const token = getToken();
  const [info, setInfo] = useState({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api(`/friends/status/${userId}`, { token });
      setInfo(data);
    } catch {
      setInfo({ status: 'none' });
    }
  }, [userId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (info.status === 'loading') return <button className="ghost" disabled>…</button>;
  if (info.status === 'self') return null;
  if (info.status === 'accepted') {
    return (
      <button
        className="ghost"
        disabled={busy}
        onClick={() => act(() => api(`/friends/remove/${userId}`, { method: 'POST', token }))}
      >
        Friends ✓ · Unfriend
      </button>
    );
  }
  if (info.status === 'pending') {
    if (info.incoming) {
      return (
        <span className="row gap">
          <button
            className="primary"
            disabled={busy}
            onClick={() => act(() => api(`/friends/accept/${userId}`, { method: 'POST', token }))}
          >
            Accept
          </button>
          <button
            className="ghost"
            disabled={busy}
            onClick={() => act(() => api(`/friends/decline/${userId}`, { method: 'POST', token }))}
          >
            Decline
          </button>
        </span>
      );
    }
    return (
      <button className="ghost" disabled>
        Request sent ⏳
      </button>
    );
  }
  return (
    <button
      className="primary"
      disabled={busy}
      onClick={() => act(() => api(`/friends/request/${userId}`, { method: 'POST', token }))}
    >
      + Add friend
    </button>
  );
}