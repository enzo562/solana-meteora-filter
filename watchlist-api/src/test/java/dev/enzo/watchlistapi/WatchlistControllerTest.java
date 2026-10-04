package dev.enzo.watchlistapi;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(WatchlistController.class)
class WatchlistControllerTest {

    private static final String NKE = "NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private WatchlistService service;

    @Test
    void getListeLesEntrees() throws Exception {
        when(service.list()).thenReturn(List.of(new WatchlistEntry(NKE, "NKE")));

        mvc.perform(get("/api/watchlist"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].mint").value(NKE))
                .andExpect(jsonPath("$.items[0].label").value("NKE"));
    }

    @Test
    void postCreeUneEntreeEn201() throws Exception {
        when(service.add(NKE, "NKE")).thenReturn(new WatchlistEntry(NKE, "NKE"));

        mvc.perform(post("/api/watchlist").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mint\":\"" + NKE + "\",\"label\":\"NKE\"}"))
                .andExpect(status().isCreated())
                .andExpect(content().json("{\"mint\":\"" + NKE + "\",\"label\":\"NKE\"}"));
    }

    @Test
    void uneErreurMetierDevientUnCorpsErrorMessage() throws Exception {
        when(service.add(eq("pasunCA"), any())).thenThrow(WatchlistException.invalidMint("pasunCA"));

        mvc.perform(post("/api/watchlist").contentType(MediaType.APPLICATION_JSON).content("{\"mint\":\"pasunCA\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_MINT"))
                .andExpect(jsonPath("$.message").value("Adresse Solana invalide : « pasunCA »."));
    }

    @Test
    void unFichierInvalideDonne409() throws Exception {
        when(service.list()).thenThrow(new InvalidWatchlistFileException(Path.of("wl.json"), new RuntimeException("ligne 1")));

        mvc.perform(get("/api/watchlist"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("INVALID_WATCHLIST_FILE"));
    }

    @Test
    void uneErreurDisqueDonne500() throws Exception {
        when(service.list()).thenThrow(new IOException("disque plein"));

        mvc.perform(get("/api/watchlist"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("IO_ERROR"));
    }

    @Test
    void unCorpsJsonIllisibleDonne400() throws Exception {
        mvc.perform(post("/api/watchlist").contentType(MediaType.APPLICATION_JSON).content("{pas du json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_BODY"));
    }

    @Test
    void patchRenomme() throws Exception {
        when(service.rename(NKE, "Nike")).thenReturn(new WatchlistEntry(NKE, "Nike"));

        mvc.perform(patch("/api/watchlist/" + NKE).contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"Nike\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("Nike"));
    }

    @Test
    void deleteRetireEn204EtNotFoundEn404() throws Exception {
        mvc.perform(delete("/api/watchlist/" + NKE)).andExpect(status().isNoContent());
        verify(service).remove(NKE);

        doThrow(WatchlistException.notFound("absent")).when(service).remove("absent");
        mvc.perform(delete("/api/watchlist/absent"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("NOT_FOUND"));
    }
}
