import { motion } from "framer-motion";
import type { PlatformInfo } from "@/lib/platform";
import {
  BsYoutube, BsInstagram, BsFacebook, BsTwitterX,
  BsPinterest, BsVimeo,
} from "react-icons/bs";
import { SiGoogledrive, SiTelegram } from "react-icons/si";

interface PlatformBadgeProps {
  platform: PlatformInfo;
  size?: "sm" | "md" | "lg";
}

const platformIcons: Record<string, React.ReactNode> = {
  youtube: <BsYoutube className="w-full h-full" />,
  instagram: <BsInstagram className="w-full h-full" />,
  facebook: <BsFacebook className="w-full h-full" />,
  twitter: <BsTwitterX className="w-full h-full" />,
  pinterest: <BsPinterest className="w-full h-full" />,
  vimeo: <BsVimeo className="w-full h-full" />,
  googledrive: <SiGoogledrive className="w-full h-full" />,
  telegram: <SiTelegram className="w-full h-full" />,
};

export function PlatformBadge({ platform, size = "md" }: PlatformBadgeProps) {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px] gap-1",
    md: "px-3 py-1 text-xs gap-1.5",
    lg: "px-4 py-1.5 text-sm gap-2",
  };
  const iconSize = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center rounded-full font-semibold backdrop-blur-sm ${sizeClasses[size]}`}
      style={{
        backgroundColor: `${platform.color}22`,
        color: platform.color,
        border: `1px solid ${platform.color}44`,
      }}
    >
      <span className={iconSize[size]}>
        {platformIcons[platform.platform] || null}
      </span>
      {platform.label}
    </motion.span>
  );
}
