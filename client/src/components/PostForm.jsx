import { useState, useRef } from 'react';
import { api, getToken, uploadFile } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Avatar from './Avatar.jsx';

export default function PostForm({ onPosted }) {
  const { user } = useAuth();
  const token = getToken();
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim() && !image) return;
    setBusy(true);
    try {
      let image_url = '';
      if (image) {
        const { url } = await uploadFile(image, null, token);
        image_url = url;
      }
      const { post } = await api('/posts', { method: 'POST', token, body: { content, image_url } });
      setContent('');
      setImage(null);
      setPreview('');
      if (fileRef.current) fileRef.current.value = '';
      onPosted?.(post);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card post-form" onSubmit={submit}>
      <div className="row">
        <Avatar user={user} size={40} />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`What's on your mind, ${user.name.split(' ')[0]}?`}
          rows={2}
        />
      </div>
      {preview && (
        <div className="preview">
          <img src={preview} alt="Preview" />
          <button type="button" className="link-btn" onClick={() => { setImage(null); setPreview(''); }}>
            Remove
          </button>
        </div>
      )}
      <footer className="post-form-foot">
        <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} hidden />
        <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
          🖼 Add photo
        </button>
        <button type="submit" className="primary" disabled={busy || (!content.trim() && !image)}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </footer>
    </form>
  );
}