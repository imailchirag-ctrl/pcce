import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4B942] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFCF6] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "bg-[#F4B942] text-[#24211D] shadow-[0_4px_14px_-4px_rgba(233,154,50,0.5)] hover:-translate-y-0.5 hover:bg-[#E99A32]",
        accent:
          "bg-[#E99A32] text-[#24211D] shadow-[0_4px_14px_-4px_rgba(233,154,50,0.5)] hover:-translate-y-0.5 hover:bg-[#F4B942]",
        secondary:
          "border border-[#EDE6DA] bg-[#FFF5E5] text-[#75451F] hover:border-[#F4B942] hover:bg-[#FFFCF6]",
        ghost: "text-[#75451F] hover:bg-[#FFF5E5] hover:text-[#24211D]",
        outline: "border border-[#EDE6DA] bg-white text-[#24211D] hover:bg-[#FFF5E5] hover:border-[#F4B942]",
        destructive: "bg-[#DC2626] text-white hover:bg-[#B91C1C]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8.5 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-5 text-sm",
        icon: "size-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return <button className={cn(buttonVariants({ variant, size }), className)} ref={ref} type={type} {...props} />;
});

export { Button, buttonVariants };
