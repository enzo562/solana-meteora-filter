package dev.enzo.watchlistapi;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

// Défense contre le DNS rebinding : écouter sur 127.0.0.1 n'empêche pas une page web malveillante
// d'atteindre le service depuis le navigateur via un domaine qui se résout en 127.0.0.1. Ce domaine
// apparaît alors dans l'en-tête Host : on n'accepte que des Host locaux (Vite garde le Host
// d'origine, localhost:5173, en relayant /api).
@Component
public class HostHeaderFilter extends OncePerRequestFilter {
    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // Sans en-tête Host (impossible depuis un navigateur, qui l'envoie toujours), on se rabat sur
        // le nom de serveur de la requête.
        String host = request.getHeader("Host");
        if (isLocal(host != null ? host : request.getServerName())) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"error\":\"FORBIDDEN_HOST\",\"message\":\"Accès réservé à la machine locale.\"}");
    }

    static boolean isLocal(String host) {
        if (host == null || host.isBlank()) return false;
        String name = host.trim().toLowerCase();
        // Retire le port : "localhost:5173" → "localhost", "[::1]:8080" → "[::1]".
        int portSeparator = name.lastIndexOf(':');
        if (portSeparator > name.lastIndexOf(']')) name = name.substring(0, portSeparator);
        return LOCAL_HOSTS.contains(name);
    }
}
