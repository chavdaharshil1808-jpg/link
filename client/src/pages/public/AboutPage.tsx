import { motion } from "framer-motion";
import { HiGlobeAlt, HiShieldCheck, HiBolt } from "react-icons/hi2";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

const values = [
  {
    icon: HiGlobeAlt,
    title: "Open Access",
    description: "Media on the internet should be accessible to everyone. We break down barriers so you can access content freely.",
  },
  {
    icon: HiShieldCheck,
    title: "Privacy First",
    description: "We never store your downloads, track your activity, or sell your data. Your privacy is non-negotiable.",
  },
  {
    icon: HiBolt,
    title: "Speed & Reliability",
    description: "Our infrastructure is built for performance. Fast downloads, high uptime, and consistent quality.",
  },
];

const team = [
  { name: "Harshil Patel", role: "Founder & Lead Developer", initials: "HP" },
  { name: "Alex Chen", role: "Backend Engineer", initials: "AC" },
  { name: "Sarah Kim", role: "UI/UX Designer", initials: "SK" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      {/* Header */}
      <section className="px-6 pt-32 pb-20">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl sm:text-5xl font-extrabold mb-6"
          >
            About{" "}
            <span className="bg-gradient-to-r from-[#6C5CE7] to-[#00E5FF] bg-clip-text text-transparent">
              Universal Downloader
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto"
          >
            We believe downloading media from the internet should be simple, fast, and private.
            Universal Downloader was built to give you a seamless experience across every platform — no
            gimmicks, no tracking, just a tool that works.
          </motion.p>
        </div>
      </section>

      {/* Mission */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-2xl p-8 sm:p-12"
          >
            <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
            <p className="text-zinc-400 leading-relaxed max-w-3xl">
              The internet is full of amazing content — tutorials, music, documentaries, research videos,
              podcasts. But accessing that content offline is often frustrating, riddled with ads, or
              requires invasive software. We set out to change that. Universal Downloader is designed
              to be the cleanest, fastest, and most respectful tool for downloading media from the web.
              We support over 1000 platforms and are constantly expanding.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-3xl font-bold text-center mb-12"
          >
            Our values
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {values.map((value, i) => (
              <motion.div
                key={value.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="glass-hover card rounded-2xl p-6"
              >
                <div className="w-11 h-11 rounded-xl bg-[#6C5CE7]/15 flex items-center justify-center mb-4">
                  <value.icon className="h-5 w-5 text-[#6C5CE7]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{value.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="px-6 pb-32">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-3xl font-bold text-center mb-12"
          >
            The team
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {team.map((member, i) => (
              <motion.div
                key={member.name}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="glass-hover card rounded-2xl p-6 flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 rounded-full bg-[#6C5CE7]/20 flex items-center justify-center text-[#6C5CE7] font-bold text-xl mb-4">
                  {member.initials}
                </div>
                <h3 className="text-base font-semibold">{member.name}</h3>
                <p className="text-sm text-zinc-500 mt-1">{member.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
