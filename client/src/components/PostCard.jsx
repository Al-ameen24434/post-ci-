import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Avatar from './Avatar.jsx';

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units = [
    [60, 'minute'],
    [60, 'hour'],
    [24, 'day'],
    [7, 'week'],
    [4, 'month'],
    [12, 'year'],
  ];
  let val = seconds;
  let label = 'second';
  for (const [div, name] of units) {
    if (val < div) {
      label = name;
      break;
    }
    val = Math.floor(val / div);
    label = name;
  }
  return `${val} ${label}${val === 1 ? '' : 's'} ago`;
}

function CommentList({ comments, currentUserId, onDelete }) {
  return (
    <ul className="comments">
      {comments.map((c) => (
        <li key={c.id} className="comment">
          <Link to={`/profile/${c.author_id}`} className="row">
            <Avatar user={{ name: c.author_name, avatar_url: c.author_avatar }} size={26} />
            <div>
              <span className="comment-author">{c.author_name}</span>
              <span className="comment-text">{c.content}</span>
            </div>
          </Link>
          {c.author_id === currentUserId && (
            <button className="link-btn tiny" onClick={() => onDelete(c.id)}>
              delete
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function PostCard({ post, onDeleted }) {
  const { user: currentUser } = useAuth();
  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [comments, setComments] = useState(post.comments || []);
  const [showComments, setShowComments] = useState(comments.length > 0);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const token = getToken();
  const isMine = currentUser?.id === post.author.id;

  const toggleLike = async () => {
    setBusy(true);
    try {
      if (liked) {
        await api(`/posts/${post.id}/like`, { method: 'DELETE', token });
        setLiked(false);
        setLikeCount((n) => n - 1);
      } else {
        await api(`/posts/${post.id}/like`, { method: 'POST', token });
        setLiked(true);
        setLikeCount((n) => n + 1);
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const loadComments = async () => {
    const data = await api(`/posts/${post.id}/comments`, { token });
    setComments(data.comments);
  };

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next) loadComments();
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const { comment } = await api(`/posts/${post.id}/comments`, {
        method: 'POST',
        token,
        body: { content: draft },
      });
      setComments((cs) => [...cs, comment]);
      setDraft('');
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteComment = async (id) => {
    await api(`/posts/comments/${id}`, { method: 'DELETE', token });
    setComments((cs) => cs.filter((c) => c.id !== id));
  };

  const removePost = async () => {
    if (!confirm('Delete this post?')) return;
    await api(`/posts/${post.id}`, { method: 'DELETE', token });
    onDeleted?.(post.id);
  };

  return (
    <article className="card post">
      <header className="post-head">
        <Link to={`/profile/${post.author.id}`}>
          <Avatar user={post.author} size={40} />
        </Link>
        <div>
          <Link to={`/profile/${post.author.id}`} className="post-author">
            {post.author.name}
          </Link>
          <span className="muted">{timeAgo(post.created_at)}</span>
        </div>
        {isMine && (
          <button className="link-btn tiny" onClick={removePost}>
            Delete
          </button>
        )}
      </header>
      <p className="post-content">{post.content}</p>
      {post.image_url && <img className="post-image" src={post.image_url} alt="Post" />}
      <footer className="post-actions">
        <button className={liked ? 'like-btn liked' : 'like-btn'} onClick={toggleLike} disabled={busy}>
          {liked ? '👍 Liked' : '👍 Like'} {likeCount > 0 && `(${likeCount})`}
        </button>
        <button className="like-btn" onClick={toggleComments}>
          💬 Comment{comments.length > 0 && ` (${comments.length})`}
        </button>
      </footer>
      {showComments && (
        <div className="comments-wrap">
          <CommentList comments={comments} currentUserId={currentUser.id} onDelete={deleteComment} />
          <form className="comment-form" onSubmit={addComment}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a comment…"
            />
            <button type="submit" className="primary" disabled={busy || !draft.trim()}>
              Post
            </button>
          </form>
        </div>
      )}
    </article>
  );
}