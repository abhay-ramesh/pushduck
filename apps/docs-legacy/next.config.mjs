import nextra from 'nextra'

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
  latex: true,
  flexsearch: {
    codeblocks: false
  },
  defaultShowCopyCode: true,
  codeHighlight: true,
  readingTime: true,
})

export default withNextra({
  i18n: {
    locales: ['en'],
    defaultLocale: 'en',
  },
})