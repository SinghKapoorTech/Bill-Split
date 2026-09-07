import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ChevronLeft, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CONTACT_EMAIL } from '@/config/contact';

/**
 * Public support page.
 *
 * Apple Guideline 1.5 requires the App Store "Support URL" to resolve to a page
 * offering a genuine way to reach the developer. A bare `mailto:` link is not
 * enough on its own: with no mail client registered (common on desktop, and on a
 * fresh review device) the click is silently swallowed and the page appears
 * broken. So the address is rendered as visible, selectable text with a copy
 * button, and the mailto is layered on top as a convenience rather than the only
 * route.
 */
export default function Contact() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions policy).
      // The address is already on screen as selectable text, so failing to copy
      // costs the user nothing — never leave them with a broken-looking button.
      setCopied(false);
    }
  };

  return (
    <div className="h-full min-h-screen overflow-y-auto bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto max-w-3xl px-6 py-4 flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">Divit Support</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-6 py-12 space-y-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-3"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
            Get in touch
          </h1>
          <p className="text-foreground/80 text-lg leading-relaxed">
            Questions, bug reports, feature ideas, or anything about your account — email us
            and a real person will read it. We usually reply within two business days.
          </p>
        </motion.div>

        <div className="h-px bg-border" />

        {/* Email card */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-xl border border-border bg-card p-6 space-y-4"
        >
          <h2 className="text-xl font-semibold text-foreground">Email us</h2>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Selectable text, not only a link — readable even if mailto does nothing. */}
            <code className="flex-1 select-all rounded-lg bg-muted px-4 py-3 text-base font-mono text-foreground break-all">
              {CONTACT_EMAIL}
            </code>

            <button
              type="button"
              onClick={handleCopy}
              aria-label={`Copy email address ${CONTACT_EMAIL}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium hover:bg-muted transition-colors shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" aria-hidden="true" />
                  Copy
                </>
              )}
            </button>
          </div>

          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Mail className="w-4 h-4" aria-hidden="true" />
            Open in your mail app
          </a>
        </motion.section>

        {/* What to include */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="space-y-3"
        >
          <h2 className="text-xl font-semibold text-foreground">
            What to include for a faster reply
          </h2>
          <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc pl-5">
            <li>The email address on your Divit account</li>
            <li>What you expected to happen, and what happened instead</li>
            <li>The device and OS you are using (for example, iPhone 15 / iOS 18)</li>
            <li>A screenshot, if the problem is something you can see</li>
          </ul>
        </motion.section>

        {/* Privacy pointer */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="space-y-3"
        >
          <h2 className="text-xl font-semibold text-foreground">Your data</h2>
          <p className="text-muted-foreground leading-relaxed">
            For what we collect and how it is handled, see our{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </motion.section>
      </main>
    </div>
  );
}
