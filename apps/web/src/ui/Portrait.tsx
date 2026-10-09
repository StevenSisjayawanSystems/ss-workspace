import type { AvatarLook } from '../look'

// A flat little portrait of someone's avatar, drawn from the same colours as the figure in the world.
export function Portrait({ look }: { look: AvatarLook }) {
  return (
    <svg className="portrait" viewBox="0 0 96 96" aria-hidden="true">
      <rect width="96" height="96" fill="#1b2a3f" />
      <path d="M0 70h96v26H0z" fill="#22344d" />
      {/* cloak, with its collar */}
      <path d="M22 96c0-20 10-30 26-30s26 10 26 30z" fill={look.robe} stroke="#05090f" strokeWidth="2" strokeLinejoin="round" />
      <path d="M38 67l10 11 10-11-10-3z" fill={look.trim} stroke="#05090f" strokeWidth="2" strokeLinejoin="round" />
      {/* head and hair */}
      <circle cx="48" cy="47" r="17" fill={look.skin} stroke="#05090f" strokeWidth="2" />
      <path d="M31 46c0-12 7-18 17-18s17 6 17 18c-4-6-9-9-17-9s-13 3-17 9z" fill={look.hair} stroke="#05090f" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="42" cy="49" r="2" fill="#05090f" />
      <circle cx="54" cy="49" r="2" fill="#05090f" />
      <path d="M43 56q5 4 10 0" fill="none" stroke="#05090f" strokeWidth="2" strokeLinecap="round" />
      {look.hat && (
        <>
          <path d="M33 34l17-28 13 28z" fill={look.robe} stroke="#05090f" strokeWidth="2" strokeLinejoin="round" />
          <path d="M22 36q26-9 52 0-26 7-52 0z" fill={look.robe} stroke="#05090f" strokeWidth="2" strokeLinejoin="round" />
          <path d="M34 31q14-4 28 0l1 3q-15-4-30 0z" fill={look.trim} stroke="#05090f" strokeWidth="1.5" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}
