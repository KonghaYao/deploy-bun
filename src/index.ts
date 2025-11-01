export default {
    fetch(request: Request) {
        return new Response("Hello, world!22222", {
            headers: {
                "Content-Type": "text/plain",
            },
        });
    },
};
