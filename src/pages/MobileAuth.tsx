import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ParallaxGradientBackground } from "@/components/landing/ParallaxGradientBackground";
import { ProviderSignInButtons } from "@/components/auth/ProviderSignInButtons";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";
import type { SignInProvider } from "@/utils/authProviders";

const MobileAuth = () => {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [pendingProvider, setPendingProvider] = useState<SignInProvider | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

  // Use localStorage to persist guest claim ID across OAuth redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claimGuestId = params.get("claimGuestId");
    if (claimGuestId) {
      localStorage.setItem("pending_claim_guest_id", claimGuestId);
    }
  }, []);

  // Redirect to dashboard if already logged in, handling shadow user claims first
  useEffect(() => {
    const processUserAndRedirect = async () => {
      if (user) {
        const pendingClaimId = localStorage.getItem("pending_claim_guest_id");

        if (pendingClaimId) {
          try {
            setIsClaiming(true);
            const { billService } = await import("@/services/billService");
            await billService.claimShadowUser(pendingClaimId);
            localStorage.removeItem("pending_claim_guest_id");
          } catch (error) {
            console.error("Error claiming shadow user:", error);
          } finally {
            setIsClaiming(false);
          }
        }

        navigate("/dashboard");
      }
    };

    processUserAndRedirect();
  }, [user, navigate]);

  // Handle sign-in
  const handleSignIn = async (provider: SignInProvider) => {
    setPendingProvider(provider);

    try {
      await signIn(provider);
    } catch (error: unknown) {
      console.error("[MobileAuth] Sign-in error:", error);
    } finally {
      setPendingProvider(null);
    }
  };

  // Show loading screen during initial auth state check
  if (loading) {
    return (
      <div className="fixed inset-0 w-full h-full flex items-center justify-center">
        <ParallaxGradientBackground />
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  const logoVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.6,
        type: "spring" as const,
        bounce: 0.4,
      },
    },
  };

  return (
    <div className="fixed inset-0 w-full h-full overflow-auto">
      <ParallaxGradientBackground />

      <motion.div
        className="relative min-h-screen flex flex-col items-center justify-center px-4 py-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Animated Logo */}
        <motion.div variants={logoVariants} className="mb-8">
          <img
            src="/divit-icon.png"
            alt="Divit"
            className="w-20 h-20 rounded-3xl shadow-2xl shadow-primary/30"
          />
        </motion.div>

        {/* App Name with Gradient */}
        <motion.h1
          variants={itemVariants}
          className="text-5xl md:text-6xl font-extrabold text-center mb-4 bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent"
        >
          Divit
        </motion.h1>

        {/* Tagline */}
        <motion.h2
          variants={itemVariants}
          className="text-xl md:text-2xl text-foreground font-semibold text-center mb-2"
        >
          Split bills fairly in seconds
        </motion.h2>

        {/* Description */}
        <motion.p
          variants={itemVariants}
          className="text-base md:text-lg text-muted-foreground text-center mb-8 max-w-md"
        >
          AI-powered receipt scanner that makes splitting bills with friends
          effortless and fair
        </motion.p>

        {/* Sign In Buttons */}
        <motion.div variants={itemVariants} className="w-full max-w-sm mb-12">
          <ProviderSignInButtons
            onSignIn={handleSignIn}
            pendingProvider={pendingProvider}
            disabled={isClaiming}
            buttonClassName="h-14 text-lg font-medium shadow-xl hover:shadow-2xl"
            iconSizeClassName="[&_svg]:size-6"
          />

          <div className="mt-4">
            <EmailPasswordForm disabled={isClaiming} />
          </div>
        </motion.div>

        {/*
          The sign-in screen is the only surface a reviewer sees before
          authenticating, so the privacy policy has to be reachable from here
          too — not just from Settings behind the login (Guideline 5.1.1(i)).
        */}
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-center gap-3 text-xs text-muted-foreground"
        >
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/contact" className="hover:text-foreground transition-colors">
            Contact &amp; Support
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default MobileAuth;
