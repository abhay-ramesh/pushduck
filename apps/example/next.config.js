/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: ['localhost'],
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'localhost',
                port: '9000',
            },
        ],
    },
    transpilePackages: ['next-s3-uploader'],
    // webpack: (config, { webpack, isServer, nextRuntime }) => {
    //     // Avoid AWS SDK Node.js require issue 
    //     // Temporary fix 
    //     if (isServer && nextRuntime === "nodejs")
    //         config.plugins.push(
    //             new webpack.IgnorePlugin({ resourceRegExp: /^(aws-crt|@aws-sdk\/signature-v4-crt)$/ })
    //         );
    //     return config;
    // },
}

module.exports = nextConfig
