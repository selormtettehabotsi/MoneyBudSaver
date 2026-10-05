import React from "react";
import * as LucideIcons from "lucide-react";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 18, color, className = "" }) => {
  // Normalize icon name format (e.g. "shopping-cart" -> "ShoppingCart", "plus-circle" -> "PlusCircle")
  const pascalName = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  const IconComponent = (LucideIcons as any)[pascalName] || (LucideIcons as any)[name] || LucideIcons.Tag;

  return <IconComponent size={size} color={color} className={className} />;
};
