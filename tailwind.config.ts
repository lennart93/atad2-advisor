import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Svalner Atlas brand accents - terracotta + sage, used sparingly
					// for markers, the active step, status dots, arrows and focus.
					brand: {
						terracotta: {
							DEFAULT: 'hsl(var(--brand-terracotta))',
							deep: 'hsl(var(--brand-terracotta-deep))',
							soft: 'hsl(var(--brand-terracotta-soft))'
						},
						sage: {
							DEFAULT: 'hsl(var(--brand-sage))',
							deep: 'hsl(var(--brand-sage-deep))',
							soft: 'hsl(var(--brand-sage-soft))'
						},
						warning: 'hsl(var(--brand-warning))'
					},
					// Design system tokens (src/styles/tokens.css). Final color
				// values, so Tailwind opacity modifiers do not apply to them.
				ds: {
					ink: {
						DEFAULT: 'var(--ds-ink)',
						hover: 'var(--ds-ink-hover)',
						secondary: 'var(--ds-ink-secondary)',
						tertiary: 'var(--ds-ink-tertiary)'
					},
					hairline: 'var(--ds-hairline)',
					page: 'var(--ds-page)',
					card: 'var(--ds-card)',
					'fill-muted': 'var(--ds-fill-muted)',
					accent: {
						DEFAULT: 'var(--ds-accent)',
						bg: 'var(--ds-accent-bg)',
						text: 'var(--ds-accent-text)'
					},
					amber: {
						DEFAULT: 'var(--ds-amber)',
						bg: 'var(--ds-amber-bg)',
						text: 'var(--ds-amber-text)'
					},
					green: {
						DEFAULT: 'var(--ds-green)',
						bg: 'var(--ds-green-bg)',
						text: 'var(--ds-green-text)'
					},
					red: {
						DEFAULT: 'var(--ds-red)',
						hover: 'var(--ds-red-hover)',
						bg: 'var(--ds-red-bg)',
						text: 'var(--ds-red-text)'
					}
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				'ds-chip': 'var(--ds-radius-chip)',
				'ds-control': 'var(--ds-radius-control)',
				'ds-card': 'var(--ds-radius-card)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'fade-in': {
					'0%': {
						opacity: '0',
						transform: 'translateY(8px)'
					},
					'100%': {
						opacity: '1',
						transform: 'translateY(0)'
					}
				},
				'pulse-glow': {
					'0%, 100%': {
						boxShadow: '0 0 0 0 hsl(var(--primary) / 0.4)'
					},
					'50%': {
						boxShadow: '0 0 0 8px hsl(var(--primary) / 0)'
					}
				},
				'wiggle': {
					'0%':   { transform: 'rotate(0deg) scale(1)' },
					'4%':   { transform: 'rotate(-22deg) scale(1.18)' },
					'8%':   { transform: 'rotate(20deg) scale(1.18)' },
					'12%':  { transform: 'rotate(-16deg) scale(1.14)' },
					'16%':  { transform: 'rotate(14deg) scale(1.12)' },
					'20%':  { transform: 'rotate(-8deg) scale(1.08)' },
					'24%':  { transform: 'rotate(4deg) scale(1.04)' },
					'28%, 100%': { transform: 'rotate(0deg) scale(1)' },
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.2s ease-out',
				'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
				'wiggle': 'wiggle 3.5s ease-in-out infinite'
			},
			fontFamily: {
				sans: ['Neue Haas Grotesk Display Pro', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
				mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
			},
			letterSpacing: {
				tighter: 'var(--tracking-tighter)',
				tight: 'var(--tracking-tight)',
				snug: 'var(--tracking-snug)',
			},
			boxShadow: {
				'xs': 'var(--shadow-xs)',
				'sm': 'var(--shadow-sm)',
				'md': 'var(--shadow-md)',
				'lg': 'var(--shadow-lg)',
				'btn-primary': 'var(--shadow-btn-primary)',
			},
			transitionTimingFunction: {
				'spring': 'var(--ease-spring)',
				'emphasized': 'var(--ease-emphasized)',
			},
			transitionDuration: {
				'fast': 'var(--duration-fast)',
				'normal': 'var(--duration-normal)',
				'slow': 'var(--duration-slow)',
			},
			backgroundImage: {
				'surface-card': 'var(--surface-card)',
				'surface-header': 'var(--surface-header)',
			},
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
