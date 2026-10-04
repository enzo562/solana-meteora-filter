package dev.enzo.watchlistapi;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

// Le service n'écoute que sur 127.0.0.1, mais une page web malveillante peut quand même l'atteindre
// depuis le navigateur par DNS rebinding (un domaine qui se résout en 127.0.0.1). Le navigateur envoie
// alors l'en-tête Host de ce domaine : on n'accepte que des Host locaux.
@WebMvcTest(HealthController.class)
class HostHeaderFilterTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void accepteLesHostLocaux() throws Exception {
        for (String host : new String[] {"localhost:8080", "127.0.0.1:8080", "localhost:5173", "[::1]:8080", "localhost"}) {
            mvc.perform(get("/api/health").header("Host", host)).andExpect(status().isOk());
        }
    }

    @Test
    void refuseUnHostExterieur() throws Exception {
        mvc.perform(get("/api/health").header("Host", "attaquant.example.com:8080"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("FORBIDDEN_HOST"));
    }

    @Test
    void refuseUnHostQuiImiteLocalhost() throws Exception {
        mvc.perform(get("/api/health").header("Host", "localhost.attaquant.example.com"))
                .andExpect(status().isForbidden());
    }
}
