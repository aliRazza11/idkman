import Login from './Pages/Login/login'
import SignupPage from './Pages/Signup/signup'
import HomePage from './Pages/Homepage/homepage'
import DiffusionPage from './Pages/Dashboard/dashboard';
import ProtectedRoute from './Pages/Protected';
import { Routes, Route } from "react-router-dom";
import './App.css'

function App() {

  return (
    <Routes>
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DiffusionPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignupPage />} />
    </Routes>
  )
}

export default App

