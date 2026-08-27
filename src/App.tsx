import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import Dashboard from "@/pages/Dashboard";
import Editor from "@/pages/Editor";
import Login from "@/pages/Login";
import Register from "@/pages/Register";

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/editor/:id"
          element={
            <RequireAuth>
              <Editor />
            </RequireAuth>
          }
        />
      </Routes>
      <Toaster position="bottom-right" richColors />
    </>
  );
}

export default App;
