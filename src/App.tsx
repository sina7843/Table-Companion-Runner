import { RouterProvider } from 'react-router-dom';
import { RepositoryProvider } from './domain';
import { router } from './app/routes';

export default function App() {
  return (
    <RepositoryProvider>
      <RouterProvider router={router} />
    </RepositoryProvider>
  );
}
