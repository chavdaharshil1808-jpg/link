import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { HiArrowLeft } from "react-icons/hi2";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#09090B] text-white flex items-center justify-center px-4">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#6C5CE7]/10 blur-[120px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
        <h1 className="text-8xl font-extrabold bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] bg-clip-text text-transparent mb-4">404</h1>
        <h2 className="text-xl font-semibold mb-2">Page Not Found</h2>
        <p className="text-zinc-500 mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] text-white font-semibold rounded-xl hover:shadow-lg transition-all">
          <HiArrowLeft className="w-4 h-4" />Go Home
        </Link>
      </motion.div>
    </div>
  );
}
