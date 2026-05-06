import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Start from "./pages/Start";
import Session from "./pages/Session";
import InstructorSetup from "./pages/InstructorSetup";
import InstructorDashboard from "./pages/InstructorDashboard";
import SessionReview from "./pages/SessionReview";
import EnrolledLogin from "./pages/EnrolledLogin";
import StudentCourseDashboard from "./pages/StudentCourseDashboard";
import EnrolledSession from "./pages/EnrolledSession";

export default function App() {
  return (
    <Routes>
      {/* Marketing */}
      <Route path="/" element={<Home />} />

      {/* Practice (standalone — no instructor course needed) */}
      <Route path="/start" element={<Start />} />
      <Route path="/session/:sessionId" element={<Session />} />

      {/* Enrolled student */}
      <Route path="/enrolled" element={<EnrolledLogin />} />
      <Route path="/enrolled/course/:courseId" element={<StudentCourseDashboard />} />
      <Route path="/enrolled/session/:sessionId" element={<EnrolledSession />} />

      {/* Instructor */}
      <Route path="/instructor" element={<InstructorSetup />} />
      <Route path="/instructor/setup" element={<InstructorSetup />} />
      <Route path="/instructor/course/:courseId" element={<InstructorDashboard />} />
      <Route path="/instructor/session/:sessionId" element={<SessionReview />} />
    </Routes>
  );
}
