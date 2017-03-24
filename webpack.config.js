module.exports = {
    entry: "./src/main.js",
    devtool: "eval",
    output: {
        filename: "dist/timelinestoryteller.js"
    },
    module: {
        rules: [{
            test: /\.css$/,
            loaders: ["style-loader", "css-loader"]
        }, {
            test: /\.(png|svg)$/,
            loader: "binary-loader"
        }]
    },
    externals: {
        d3: 'd3',
        moment: "moment",
        "intro.js": "{ introJs: introJs }",
        "socket.io": "io"
    }
};