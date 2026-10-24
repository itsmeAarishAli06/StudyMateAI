function BrandMark({ className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 14.5c5.3-2.1 11.1-.9 17 2.4v18.2c-5.9-3.3-11.7-4.5-17-2.4V14.5Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="M41 14.5c-5.3-2.1-11.1-.9-17 2.4v18.2c5.9-3.3 11.7-4.5 17-2.4V14.5Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path d="M13 20.5c2.6-.2 5 .3 7.5 1.6M13 26c2.6-.2 5 .3 7.5 1.6M35 20.5c-2.6-.2-5 .3-7.5 1.6M35 26c-2.6-.2-5 .3-7.5 1.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <path d="m35.5 5 .9 2.7 2.6.9-2.6.9-.9 2.7-.9-2.7-2.6-.9 2.6-.9.9-2.7Z" fill="currentColor" />
    </svg>
  )
}

export default BrandMark
