import axios from "axios";

const getToken = async () => {
    try {
        const response = await axios.post(`${process.env.WORDPRESS_URL}/wp-json/jwt-auth/v1/token`, {
            username: process.env.WORDPRESS_USERNAME,
            password: process.env.WORDPRESS_PASSWORD
        });

        const token = response.data.token;
        return token;
    } catch (error) {
        console.error('Erro ao obter token:', error.response.data);
    }
}

export default getToken;