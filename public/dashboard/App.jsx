// Root app — switches between marketing pages and dashboard.
const { useState: useStateApp } = React;

function App() {
  const [page, setPage] = useStateApp('home');
  const isDash = page === 'analytics' || page === 'asystent';
  const dashInitial = page === 'asystent' ? 'asystent' : 'overview';

  return (
    <>
      {!isDash && <TopNav page={page} setPage={setPage} />}
      {page === 'home' && <HomePage setPage={setPage} />}
      {page === 'pricing' && <PricingPage />}
      {page === 'about' && <AboutPage />}
      {isDash && <Dashboard key={dashInitial} initialActive={dashInitial} onExit={() => setPage('home')} />}
    </>
  );
}

window.App = App;
