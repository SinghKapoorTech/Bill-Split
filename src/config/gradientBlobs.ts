import { GradientBlob, ParallaxConfig } from "@/types/gradient.types";

// Desktop configuration (≥1024px)
export const desktopConfig: ParallaxConfig = {
  background: {
    speed: 0.3,
    zIndex: 1,
    blobs: [
      {
        color: "hsl(202, 80%, 62%)", // Cyan primary
        opacity: 0.12,
        size: "900px",
        position: { x: "10%", y: "5%" },
        blur: "100px",
      },
      {
        color: "hsl(270, 70%, 65%)", // Purple
        opacity: 0.12,
        size: "800px",
        position: { x: "75%", y: "20%" },
        blur: "120px",
      },
      {
        color: "hsl(175, 65%, 58%)", // Teal
        opacity: 0.10,
        size: "1000px",
        position: { x: "45%", y: "60%" },
        blur: "110px",
      },
      {
        color: "hsl(202, 80%, 62%)", // Cyan primary
        opacity: 0.10,
        size: "850px",
        position: { x: "20%", y: "85%" },
        blur: "100px",
      },
      {
        color: "hsl(270, 70%, 65%)", // Purple
        opacity: 0.11,
        size: "750px",
        position: { x: "80%", y: "75%" },
        blur: "90px",
      },
    ],
  },
  midground: {
    speed: 0.5,
    zIndex: 2,
    blobs: [
      {
        color: "hsl(12, 100%, 50%)", // Coral
        opacity: 0.18,
        size: "600px",
        position: { x: "15%", y: "15%" },
        blur: "60px",
      },
      {
        color: "hsl(210, 85%, 55%)", // Blue
        opacity: 0.18,
        size: "650px",
        position: { x: "65%", y: "10%" },
        blur: "70px",
      },
      {
        color: "hsl(330, 80%, 65%)", // Pink
        opacity: 0.15,
        size: "550px",
        position: { x: "85%", y: "40%" },
        blur: "60px",
      },
      {
        color: "hsl(12, 100%, 50%)", // Coral
        opacity: 0.16,
        size: "600px",
        position: { x: "30%", y: "50%" },
        blur: "65px",
      },
      {
        color: "hsl(210, 85%, 55%)", // Blue
        opacity: 0.17,
        size: "580px",
        position: { x: "70%", y: "70%" },
        blur: "60px",
      },
      {
        color: "hsl(330, 80%, 65%)", // Pink
        opacity: 0.15,
        size: "520px",
        position: { x: "10%", y: "90%" },
        blur: "55px",
      },
    ],
  },
  foreground: {
    speed: 0.7,
    zIndex: 3,
    blobs: [
      {
        color: "hsl(180, 100%, 70%)", // Bright cyan
        opacity: 0.10,
        size: "400px",
        position: { x: "5%", y: "25%" },
        blur: "35px",
      },
      {
        color: "hsl(38, 92%, 50%)", // Amber
        opacity: 0.10,
        size: "350px",
        position: { x: "50%", y: "8%" },
        blur: "40px",
      },
      {
        color: "hsl(180, 100%, 70%)", // Bright cyan
        opacity: 0.08,
        size: "380px",
        position: { x: "90%", y: "30%" },
        blur: "35px",
      },
      {
        color: "hsl(38, 92%, 50%)", // Amber
        opacity: 0.09,
        size: "360px",
        position: { x: "25%", y: "45%" },
        blur: "38px",
      },
      {
        color: "hsl(180, 100%, 70%)", // Bright cyan
        opacity: 0.10,
        size: "400px",
        position: { x: "60%", y: "55%" },
        blur: "35px",
      },
      {
        color: "hsl(38, 92%, 50%)", // Amber
        opacity: 0.08,
        size: "340px",
        position: { x: "40%", y: "78%" },
        blur: "40px",
      },
      {
        color: "hsl(180, 100%, 70%)", // Bright cyan
        opacity: 0.09,
        size: "370px",
        position: { x: "75%", y: "88%" },
        blur: "35px",
      },
    ],
  },
};

// Tablet configuration (768px-1023px)
export const tabletConfig: ParallaxConfig = {
  background: {
    speed: 0.3,
    zIndex: 1,
    blobs: [
      {
        color: "hsl(202, 80%, 62%)",
        opacity: 0.12,
        size: "700px",
        position: { x: "15%", y: "10%" },
        blur: "70px",
      },
      {
        color: "hsl(270, 70%, 65%)",
        opacity: 0.11,
        size: "650px",
        position: { x: "70%", y: "25%" },
        blur: "80px",
      },
      {
        color: "hsl(175, 65%, 58%)",
        opacity: 0.10,
        size: "750px",
        position: { x: "40%", y: "70%" },
        blur: "75px",
      },
    ],
  },
  midground: {
    speed: 0.5,
    zIndex: 2,
    blobs: [
      {
        color: "hsl(12, 100%, 50%)",
        opacity: 0.17,
        size: "500px",
        position: { x: "20%", y: "20%" },
        blur: "50px",
      },
      {
        color: "hsl(210, 85%, 55%)",
        opacity: 0.17,
        size: "520px",
        position: { x: "65%", y: "15%" },
        blur: "55px",
      },
      {
        color: "hsl(330, 80%, 65%)",
        opacity: 0.14,
        size: "480px",
        position: { x: "80%", y: "50%" },
        blur: "50px",
      },
      {
        color: "hsl(210, 85%, 55%)",
        opacity: 0.16,
        size: "500px",
        position: { x: "25%", y: "80%" },
        blur: "50px",
      },
    ],
  },
  foreground: {
    speed: 0.7,
    zIndex: 3,
    blobs: [
      {
        color: "hsl(180, 100%, 70%)",
        opacity: 0.09,
        size: "320px",
        position: { x: "10%", y: "30%" },
        blur: "30px",
      },
      {
        color: "hsl(38, 92%, 50%)",
        opacity: 0.09,
        size: "300px",
        position: { x: "55%", y: "12%" },
        blur: "32px",
      },
      {
        color: "hsl(180, 100%, 70%)",
        opacity: 0.08,
        size: "310px",
        position: { x: "75%", y: "60%" },
        blur: "30px",
      },
      {
        color: "hsl(38, 92%, 50%)",
        opacity: 0.08,
        size: "290px",
        position: { x: "35%", y: "85%" },
        blur: "32px",
      },
    ],
  },
};

// Mobile configuration (<768px)
export const mobileConfig: ParallaxConfig = {
  background: {
    speed: 0.4,
    zIndex: 1,
    blobs: [
      {
        color: "hsl(202, 80%, 62%)",
        opacity: 0.10,
        size: "500px",
        position: { x: "20%", y: "15%" },
        blur: "50px",
      },
      {
        color: "hsl(270, 70%, 65%)",
        opacity: 0.10,
        size: "450px",
        position: { x: "65%", y: "35%" },
        blur: "55px",
      },
      {
        color: "hsl(175, 65%, 58%)",
        opacity: 0.09,
        size: "550px",
        position: { x: "30%", y: "75%" },
        blur: "50px",
      },
    ],
  },
  midground: {
    speed: 0.6,
    zIndex: 2,
    blobs: [
      {
        color: "hsl(12, 100%, 50%)",
        opacity: 0.14,
        size: "380px",
        position: { x: "25%", y: "25%" },
        blur: "40px",
      },
      {
        color: "hsl(210, 85%, 55%)",
        opacity: 0.14,
        size: "400px",
        position: { x: "70%", y: "20%" },
        blur: "42px",
      },
      {
        color: "hsl(330, 80%, 65%)",
        opacity: 0.12,
        size: "360px",
        position: { x: "80%", y: "60%" },
        blur: "40px",
      },
      {
        color: "hsl(210, 85%, 55%)",
        opacity: 0.13,
        size: "380px",
        position: { x: "20%", y: "85%" },
        blur: "40px",
      },
    ],
  },
  foreground: {
    speed: 0.7,
    zIndex: 3,
    blobs: [],
  },
};
