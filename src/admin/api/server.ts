import { serve } from "_/api:factory";
import app from "./app";

await serve(app);
