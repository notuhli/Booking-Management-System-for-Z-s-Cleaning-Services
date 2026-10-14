// The logo asset is already a green tile with a white mark, so it reads cleanly
// on both light surfaces and dark ones (hero glass, admin sidebar, auth panels).
// The old 'white' variant wrapped it in a translucent badge for the fully
// transparent hero navbar that no longer exists — removed once every call site
// moved to the plain mark.
export default function ZCleanLogo({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: size * 0.28,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxSizing: 'border-box', overflow: 'hidden',
    }}>
      <img
        src="/brand/logo.jpg"
        alt="Z's Cleaning Services logo"
        style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: size * 0.28 }}
      />
    </div>
  );
}
