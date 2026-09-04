import { Outlet } from "react-router";
import { AppProvider } from "_/app";

export default function App() {
  return (
    <AppProvider>
      <Outlet />
    </AppProvider>
  );
}
