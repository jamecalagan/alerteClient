export const lightTheme = {
	background: "#d8d8d8",
	card: "#c7c7c7",
	border: "#cccccc",
	text: "#333333",
	placeholder: "#7e7e7e",
  };
  
  export const darkTheme = {
	background: "#121212",
	card: "#1e1e1e",
	border: "#333333",
	text: "#ffffff",
	placeholder: "#999999",
  };
  const getStyles = (theme) => ({
	container: {
	  flex: 1,
	  padding: 10,
	  backgroundColor: theme.background,
	},
	card: {
	  backgroundColor: theme.card,
	  borderColor: theme.border,
	  borderWidth: 1,
	  borderRadius: 5,
	  padding: 10,
	  marginVertical: 8,
	  marginHorizontal: 12,
	},
	text: {
	  color: theme.text,
	},
	input: {
	  backgroundColor: theme.card,
	  color: theme.text,
	  borderColor: theme.border,
	  borderWidth: 1,
	  borderRadius: 5,
	  padding: 10,
	  marginBottom: 10,
	},
	button: {
	  backgroundColor: theme.card,
	  borderColor: theme.border,
	  borderWidth: 1,
	  borderRadius: 5,
	  padding: 10,
	  alignItems: "center",
	  marginTop: 10,
	},
	buttonText: {
	  color: theme.text,
	  fontWeight: "bold",
	}
  });
  
  const styles = getStyles(theme);
  
  