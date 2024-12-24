module.exports = function (api) {
	api.cache(true);
	return {
	  presets: [
		['@babel/preset-react', { runtime: 'automatic' }],
		['babel-preset-expo'],
	  ],
	  plugins: [
		['@babel/plugin-transform-class-properties', { loose: true }],
		['@babel/plugin-transform-private-methods', { loose: true }],
		['@babel/plugin-transform-private-property-in-object', { loose: true }],
		['react-native-reanimated/plugin'],
	  ],
	};
  };
  
