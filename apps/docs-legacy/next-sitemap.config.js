/** @type {import('next-sitemap').IConfig} */
module.exports = {
    siteUrl: process.env.SITE_URL || 'https://next-s3-uploader.abhayramesh.com',
    generateRobotsTxt: true, // (optional)
    generateIndexSitemap: false, // (optional)
}