import * as React from "react"

// Layered "proof stack" mark: a filled top plane over two open strata.
export function Logo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={className}
      {...props}
    >
      <title>Proofstack</title>
      <path
        d="M12 2.5 L21.5 7.5 L12 12.5 L2.5 7.5 Z"
        fill="currentColor"
      />
      <path
        d="M2.5 12 L12 17 L21.5 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 16.5 L12 21.5 L21.5 16.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.45"
      />
    </svg>
  )
}
