import type { ParentComponent } from "solid-js";
import { AppProvider } from "_/app";

const App: ParentComponent = (props) => {
  return <AppProvider>{props.children}</AppProvider>;
};

export default App;
