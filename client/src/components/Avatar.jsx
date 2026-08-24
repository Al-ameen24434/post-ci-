export default function Avatar({ user, size = 40 }) {
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : '?';
  if (user?.avatar_url) {
    return <img className="avatar" src={user.avatar_url} alt={user.name} style={{ width: size, height: size }} />;
  }
  return (
    <div className="avatar placeholder" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {initial}
    </div>
  );
}