package dev.enzo.watchlistapi;

import java.time.Clock;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class WatchlistApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(WatchlistApiApplication.class, args);
	}

	// Injecté dans WatchlistService pour calculer l'activité de l'alerteur (remplaçable en test).
	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

}
