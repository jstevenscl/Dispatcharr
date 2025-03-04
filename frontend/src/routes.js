import ProxyManager from './components/ProxyManager';

// ...existing code...

const routes = [
  ...existing routes...,
  {
    path: '/proxy',
    element: <ProxyManager />,
    name: 'Proxy Manager',
  },
];

export default routes;
