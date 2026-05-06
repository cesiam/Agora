export type ColorKey = "primary" | "secondary" | "accent";

export const colorClasses: Record<ColorKey, {
  bg: string;
  bgLight: string;
  text: string;
  cardBorder: string;
  hover: string;
}> = {
  primary: {
    bg: "bg-primary",
    bgLight: "bg-primary/10",
    text: "text-primary",
    cardBorder: "group-hover:border-primary/50",
    hover: "hover:border-primary",
  },
  secondary: {
    bg: "bg-secondary",
    bgLight: "bg-secondary/10",
    text: "text-secondary",
    cardBorder: "group-hover:border-secondary/50",
    hover: "hover:border-secondary",
  },
  accent: {
    bg: "bg-accent",
    bgLight: "bg-accent/10",
    text: "text-accent",
    cardBorder: "group-hover:border-accent/50",
    hover: "hover:border-accent",
  },
};
