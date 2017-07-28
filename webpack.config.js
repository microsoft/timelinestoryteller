module.exports = {
    entry: "./src/index.js",
    output: {
        filename: "dist/timelinestoryteller.js",
        libraryTarget: "umd",
        library: "TimelineStoryteller"
    },
    module: {
        rules: [{
            test: /\.css$/,
            loaders: ["style-loader", "css-loader"]
        }, {
            test: /\.(png|svg)$/,
            loader: "binary-loader"
        }, {
            test: /\.js$/,
            exclude: /(node_modules|bower_components)/,
            use: {
                loader: "babel-loader"
            }
        }]
    },
    externals: {
        d3: "d3",
        moment: "moment",
        "intro.js": "introJs",
        "socket.io": "io",
        "ellipsize": "ellipsize"
    }
};