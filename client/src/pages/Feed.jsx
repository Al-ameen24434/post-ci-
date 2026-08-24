import { useState, useEffect, useCallback } from 'react';
import { api, getToken } from '../api.js';
import PostCard from '../components/PostCard.jsx';
import PostForm from '../components/PostForm.jsx';
import { useAuth } from '../AuthContext.jsx';

export default function Feed() {
  const { user } = useAuth();
  const token = getToken();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (pageNum, replace = false) => {
      try {
        const data = await api(`/posts/feed?page=${pageNum}`, { token });
        setPosts((prev) => (replace ? data.posts : [...prev, ...data.posts]));
        setHasMore(data.hasMore);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load(1, true);
  }, [load]);

  const addPost = (post) => setPosts((prev) => [post, ...prev]);
  const removePost = (id) => setPosts((prev) => prev.filter((p) => p.id !== id));

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next);
  };

  return (
    <div className="feed">
      <PostForm onPosted={addPost} />
      {error && <div className="error">{error}</div>}
      {loading && <div className="center">Loading feed…</div>}
      {!loading && posts.length === 0 && (
        <div className="card center muted">No posts yet. Add friends or create a post!</div>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onDeleted={removePost} />
      ))}
      {hasMore && (
        <button className="ghost wide" onClick={loadMore}>
          Load more
        </button>
      )}
    </div>
  );
}