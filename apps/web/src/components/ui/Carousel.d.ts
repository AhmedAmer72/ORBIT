import type { CSSProperties, ReactNode } from "react";

export interface CarouselItem {
  id?: string | number;
  title?: string;
  description?: string;
  image?: string;
  alt?: string;
  icon?: ReactNode;
}

export interface CarouselProps {
  items?: Array<CarouselItem | string | ReactNode>;
  baseWidth?: number | string;
  aspectRatio?: number;
  peek?: number;
  gap?: number;
  radius?: number;
  frame?: boolean;
  effect?: "tilt" | "slide" | "scale" | "fade" | "cube";
  indicator?: "dots" | "bars" | "counter" | "none";
  arrows?: boolean;
  autoplay?: boolean;
  autoplayDelay?: number;
  pauseOnHover?: boolean;
  loop?: boolean;
  draggable?: boolean;
  round?: boolean;
  initialIndex?: number;
  /** When set, scroll or other parent state moves the carousel to this card. */
  index?: number;
  theme?: "dark" | "light";
  onChange?: (index: number) => void;
  className?: string;
  style?: CSSProperties;
}

export default function Carousel(props: CarouselProps): ReactNode;
